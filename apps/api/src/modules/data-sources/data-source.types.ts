import type { DataQuery, DataSource } from "@flowmind/shared";

export type DataSourceSecret = { password: string };
export type DataSourceRecord = Omit<DataSource, "hasCredentials"> & { encryptedCredentials: string | null; createdBy: string };
export type DataQueryRecord = DataQuery & { createdBy: string };

