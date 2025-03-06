import { lookup as mimeLookup } from "mime-types";

export function getMimeType(filename: string): string {
    return mimeLookup(filename) || "application/octet-stream"; // Fallback for unknown types
}

export function createBasicAuthHeader(username: String, password: String) {
    const credentials = `${username}:${password}`;
    const encodedCredentials = btoa(credentials); // Base64 encoding
    return `Basic ${encodedCredentials}`;
}
