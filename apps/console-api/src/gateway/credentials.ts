/**
 * What the channel is trusted with, and what it is trusted by.
 *
 * Two separate things, and they fail differently. The pinned certificate is
 * the channel's only trust root, so a Gateway presenting anything else is not
 * connected to at all (ADR 0004). The Gateway Token is a per-call credential
 * that only travels over that verified channel — `grpc-js` refuses to attach
 * one to an insecure channel, which is the behaviour that makes it impossible
 * to send this token in the clear by mistake.
 *
 * Both are read from files, once, at startup. That is not a convenience: the
 * Gateway reads its own token once at startup too, so rotation is already a
 * brief outage where both ends are restarted (ADR 0003), and re-reading the
 * file per call would buy nothing but a window where the two halves of one
 * restart disagree.
 */
import { readFileSync } from "node:fs";
import {
  credentials,
  Metadata,
  type CallCredentials,
  type ChannelCredentials,
} from "@grpc/grpc-js";

/** Where the pinned certificate and the Gateway Token are read from. */
export interface GatewaySecrets {
  /** The Gateway's self-signed certificate, PEM, used as the only root. */
  certificateFile: string;
  /**
   * The Gateway Token. A file, because a token in an environment variable is
   * a token in `docker inspect`, in a crash dump and in every child process.
   */
  tokenFile: string;
}

/** The channel's credentials: the pinned root, and the token composed onto it. */
export function gatewayCredentials(secrets: GatewaySecrets): ChannelCredentials {
  const certificate = readFileSync(secrets.certificateFile);

  return credentials
    .createSsl(certificate)
    .compose(bearerToken(readToken(secrets.tokenFile)));
}

/**
 * The Gateway Token as `authorization: Bearer <token>` on every call.
 *
 * There is no mTLS on this hop — `serve.py` asks for no client certificate —
 * so this header is the entire authorization story, and it is the reason the
 * certificate above is verified rather than merely encrypted against.
 */
function bearerToken(token: string): CallCredentials {
  return credentials.createFromMetadataGenerator((_params, callback) => {
    const metadata = new Metadata();
    metadata.set("authorization", `Bearer ${token}`);
    callback(null, metadata);
  });
}

/**
 * The token, less whatever the file ends with.
 *
 * A secret file written by a person, or by `echo`, ends in a newline, and a
 * newline in a header value is not a header the Gateway will accept. An empty
 * file is refused here rather than at the first request: it is a deployment
 * fault, and the process failing to start says so far more plainly than every
 * request answering 500.
 */
function readToken(file: string): string {
  const token = readFileSync(file, "utf8").trim();
  if (token === "") {
    throw new Error(`the Gateway Token file ${file} is empty`);
  }

  return token;
}
