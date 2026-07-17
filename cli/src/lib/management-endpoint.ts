function encodeManagementPath(path: string): string {
  const segments = path.split("/");
  return segments
    .map((segment) => (segment.length > 0 ? encodeURIComponent(segment) : ""))
    .join("/");
}

export function encodeManagementEndpoint(endpoint: string): string {
  const queryStartIndex = endpoint.indexOf("?");
  if (queryStartIndex === -1) {
    return encodeManagementPath(endpoint);
  }

  const path = endpoint.slice(0, queryStartIndex);
  const query = endpoint.slice(queryStartIndex);
  return `${encodeManagementPath(path)}${query}`;
}
