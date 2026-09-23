import type { CloudConfig } from "../config";
import type { CloudClient } from "../types";
import { CloudDriveClient } from "./clouddriveClient";
import { MockCloudClient } from "./mockCloudClient";

export function createCloudClient(config: CloudConfig): CloudClient {
  if (config.mock) return new MockCloudClient();
  return new CloudDriveClient(config);
}

export { CloudDriveClient, MockCloudClient };
