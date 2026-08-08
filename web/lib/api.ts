"use client";

/**
 * Base URL for the Python evidence API.  Keep this explicit so development can
 * run the Next.js theater and Python ingestion/API processes independently.
 */
export const RADAR_API_URL = (process.env.NEXT_PUBLIC_RADAR_API_URL ?? "").replace(/\/$/, "");

export async function radarFetch<T>(path: string): Promise<T> {
  const response = await fetch(`${RADAR_API_URL}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Radar API request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}
