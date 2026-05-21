export function shouldRefreshDetectionForConfigDocument(event: {
  isConfigDocument: boolean;
  reason: "change" | "save";
}) {
  return event.isConfigDocument && event.reason === "save";
}
