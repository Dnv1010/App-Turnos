import { SignJWT, importPKCS8 } from "jose";
import { parseResponseJson } from "@/lib/parseFetchJson";

/** OAuth2 token para Drive usando service account (jose + fetch, sin googleapis). */
async function getAccessToken(): Promise<string> {
  const privateKeyPem = (process.env.GOOGLE_PRIVATE_KEY ?? "")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "");
  console.log("[Drive] KEY starts with:", privateKeyPem.substring(0, 30));
  console.log("[Drive] KEY ends with:", privateKeyPem.slice(-30));
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ?? "";
  const privateKey = await importPKCS8(privateKeyPem, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/drive.file",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: "RS256" })
    .sign(privateKey);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await parseResponseJson<{ access_token?: string }>(res);
  if (!data?.access_token) throw new Error("[Drive] No se obtuvo access_token");
  return data.access_token;
}

export interface UploadResult {
  fileId: string;
  webViewLink: string;
}

export async function uploadToDrive(base64Data: string, fileName: string): Promise<UploadResult> {
  if (!base64Data) throw new Error("[Drive] base64Data es undefined o vacío");
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID ?? "";
  if (!folderId) throw new Error("[Drive] GOOGLE_DRIVE_FOLDER_ID es requerido");

  const base64Clean = base64Data.includes(",") ? base64Data.split(",")[1] : base64Data;
  const buffer = Buffer.from(base64Clean, "base64");

  const token = await getAccessToken();
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const boundary = "bia_boundary";
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: image/jpeg\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`[Drive] Upload failed ${uploadRes.status}: ${errText}`);
  }

  const file = await parseResponseJson<{ id?: string; webViewLink?: string }>(uploadRes);
  if (!file?.id) throw new Error("[Drive] Respuesta sin id");

  await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}/permissions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  const webViewLink = file.webViewLink ?? `https://drive.google.com/file/d/${file.id}/view`;
  return { fileId: file.id, webViewLink };
}
