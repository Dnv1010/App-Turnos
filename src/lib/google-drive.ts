const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "10LgbhGvqxe0TAY11KcQKkQgNt5x4Hiex";
const DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY || "";
const SERVICE_EMAIL = process.env.GOOGLE_SERVICE_EMAIL;
const SERVICE_KEY = process.env.GOOGLE_SERVICE_KEY;

interface UploadResult {
  fileId: string;
  webViewLink: string;
}

export async function uploadToDrive(
  base64Data: string,
  fileName: string
): Promise<UploadResult> {
  const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Content, "base64");

  console.log("[Drive] Uploading file:", fileName, "size:", buffer.length, "bytes", "folder:", DRIVE_FOLDER_ID);

  if (SERVICE_EMAIL && SERVICE_KEY && DRIVE_FOLDER_ID) {
    try {
      const { google } = await import("googleapis");
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: SERVICE_EMAIL,
          private_key: SERVICE_KEY.replace(/\\n/g, "\n"),
        },
        scopes: ["https://www.googleapis.com/auth/drive.file"],
      });
      const drive = google.drive({ version: "v3", auth });
      const { Readable } = await import("stream");
      const readable = Readable.from(buffer);

      const res = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [DRIVE_FOLDER_ID],
          mimeType: "image/jpeg",
        },
        media: { mimeType: "image/jpeg", body: readable },
        fields: "id, webViewLink",
      });

      const fileId = res.data.id || "";
      const webViewLink = res.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

      try {
        await drive.permissions.create({
          fileId,
          requestBody: { role: "reader", type: "anyone" },
        });
        console.log("[Drive] Permisos públicos asignados");
      } catch (permErr) {
        console.warn("[Drive] No se pudo asignar permiso público:", permErr);
      }

      console.log("[Drive] Upload success (service account), id:", fileId);
      return { fileId, webViewLink };
    } catch (err) {
      console.error("[Drive] Error con service account:", err);
      throw err;
    }
  }

  if (!DRIVE_API_KEY || !DRIVE_FOLDER_ID) {
    throw new Error("Configura GOOGLE_DRIVE_FOLDER_ID y GOOGLE_DRIVE_API_KEY, o GOOGLE_SERVICE_EMAIL y GOOGLE_SERVICE_KEY en .env");
  }

  const metadata = {
    name: fileName,
    mimeType: "image/jpeg",
    parents: [DRIVE_FOLDER_ID],
  };

  const boundary = "bia_turnos_boundary_" + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartBody = Buffer.concat([
    Buffer.from(
      delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        "Content-Type: image/jpeg\r\n\r\n"
    ),
    buffer,
    Buffer.from(closeDelimiter),
  ]);

  const response = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&key=${DRIVE_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(multipartBody.length),
      },
      body: multipartBody,
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Drive] Upload failed:", response.status, errorText);
    throw new Error(`Google Drive upload failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const webViewLink = `https://drive.google.com/file/d/${data.id}/view`;
  console.log("[Drive] Upload success, id:", data.id);

  return {
    fileId: data.id,
    webViewLink,
  };
}
