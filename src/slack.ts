import { CalendarAccessError } from "./google.js";

export async function sendAccessErrorAlert(
  error: CalendarAccessError,
): Promise<void> {
  const webhookUrl = process.env.SLACK_ERROR_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error(
      "Cannot send Slack alert: SLACK_ERROR_ALERT_WEBHOOK_URL is not configured.",
    );
    return;
  }

  const tokenName =
    error.account === "work" ? "WORK_REFRESH_TOKEN" : "PERSONAL_REFRESH_TOKEN";
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text:
        `:rotating_light: *Calendar sync authentication failed*\n` +
        `Could not pull data from the *${error.account}* Google Calendar. ` +
        `The access credentials may be expired or revoked. Update the ` +
        `\`${tokenName}\` GitHub Actions secret.`,
    }),
  });

  if (!response.ok) {
    throw new Error(
      `Slack returned ${response.status} while sending the access-token alert`,
    );
  }
}
