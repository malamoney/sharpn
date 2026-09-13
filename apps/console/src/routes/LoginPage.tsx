import {
  Button,
  Card,
  Center,
  chakra,
  Field,
  Flex,
  Heading,
  Input,
  Text,
} from "@chakra-ui/react";
import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router";

import { ApiError } from "../api/apiError.js";
import { login } from "../api/session.js";
import { BrandMark } from "../components/BrandMark.js";

interface LocationState {
  from?: string;
}

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(undefined);

    try {
      await login(password);
      const from = (location.state as LocationState | null)?.from ?? "/";
      navigate(from, { replace: true });
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Center as="main" minH="100vh" px="4" py="6">
      <Card.Root w="full" maxW="360px" rounded="16px" border="none" shadow="card" bg="white">
        <Card.Body px="7" py="8" gap="2">
          <Flex align="center" gap="3">
            <BrandMark size={44} />
            <Heading as="h1" fontSize="22px" fontWeight="800" letterSpacing="-0.02em">
              Sharpn
            </Heading>
          </Flex>
          <Text mb="3" fontSize="13.5px" color="gray.500">
            Sign in to see and change your lights.
          </Text>
          <chakra.form
            display="flex"
            flexDirection="column"
            gap="2"
            onSubmit={(event) => void handleSubmit(event)}
          >
            <Field.Root required>
              <Field.Label fontSize="13px" fontWeight="600" color="gray.600">
                Password
              </Field.Label>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                disabled={submitting}
                h="40px"
                rounded="8px"
              />
            </Field.Root>
            <Button
              type="submit"
              colorPalette="blue"
              mt="2"
              h="40px"
              rounded="8px"
              fontWeight="600"
              disabled={submitting || password.length === 0}
            >
              Sign in
            </Button>
            {error !== undefined && (
              <Text role="alert" mt="1" fontSize="13px" color="red.500">
                {error}
              </Text>
            )}
          </chakra.form>
        </Card.Body>
      </Card.Root>
    </Center>
  );
}

function messageFor(cause: unknown): string {
  if (cause instanceof ApiError) {
    if (cause.code === "NOT_AUTHENTICATED") {
      return "That password does not match.";
    }
    if (cause.code === "TOO_MANY_REQUESTS") {
      return "Too many attempts. Wait a moment and try again.";
    }
    return cause.message;
  }

  // `fetch` rejects with a `TypeError` when it cannot complete the exchange
  // at all — the one failure `login` never answered. Anything else is a
  // fault this Console did not anticipate, not a claim about connectivity.
  if (cause instanceof TypeError) {
    return "Can't reach the Console API. Check the connection to this device.";
  }

  return "Something went wrong that this Console did not expect.";
}
