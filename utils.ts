export function createBasicAuthHeader(username: String, password: String) {
    const credentials = `${username}:${password}`;
    const encodedCredentials = btoa(credentials); // Base64 encoding
    return `Basic ${encodedCredentials}`;
}
