import assert from "node:assert/strict";
import test from "node:test";

process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.WORK_REFRESH_TOKEN = "test-work-token";
process.env.PERSONAL_REFRESH_TOKEN = "test-personal-token";

const { isGoogleAuthError } = await import("./google.js");

test("recognizes HTTP 401 as an authentication failure", () => {
  assert.equal(isGoogleAuthError({ response: { status: 401 } }), true);
});

test("recognizes an OAuth invalid_grant response", () => {
  assert.equal(
    isGoogleAuthError({
      response: { status: 400, data: { error: "invalid_grant" } },
    }),
    true,
  );
});

test("recognizes a Google API authError reason", () => {
  assert.equal(
    isGoogleAuthError({
      response: {
        status: 403,
        data: {
          error: {
            errors: [{ reason: "authError" }],
          },
        },
      },
    }),
    true,
  );
});

test("does not classify an ordinary permission failure as a token failure", () => {
  assert.equal(
    isGoogleAuthError({
      response: {
        status: 403,
        data: { error: { status: "PERMISSION_DENIED" } },
      },
    }),
    false,
  );
});
