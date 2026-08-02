import { readFileSync } from "node:fs";

export function readPasswordFromStandardInput() {
  const encodedPassword = readFileSync(0, "utf8");
  if (
    !encodedPassword ||
    encodedPassword.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedPassword)
  ) {
    throw new Error("Geschützte Passworteingabe besitzt ein ungültiges Format.");
  }

  const passwordBytes = Buffer.from(encodedPassword, "base64");
  if (
    passwordBytes.length % 2 !== 0 ||
    passwordBytes.toString("base64") !== encodedPassword
  ) {
    passwordBytes.fill(0);
    throw new Error("Geschützte Passworteingabe konnte nicht dekodiert werden.");
  }

  const password = passwordBytes.toString("utf16le");
  passwordBytes.fill(0);
  if (password.length < 16 || /[\r\n]/.test(password)) {
    throw new Error("Keystore-Passwort besitzt nicht das erwartete Eingabeformat.");
  }
  return password;
}
