const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY_RAW = process.env.GOOGLE_PRIVATE_KEY;
const PRIVATE_KEY = PRIVATE_KEY_RAW ? PRIVATE_KEY_RAW.replace(/\\n/g, "\n") : "";

interface UploadResult {
  fileId: string;
  webViewLink: string;
}

export async function uploadToDrive(
  base64Data: string,
  fileName: string
): Promise<UploadResult> {
  if (!base64Data) throw new Error("[Drive] base64Data es undefined o vacío");

  // Diagnóstico: variables de entorno (no loguear el valor de la key)
  console.log("[Drive] EMAIL:", process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
  console.log("[Drive] KEY exists:", !!process.env.GOOGLE_PRIVATE_KEY);
  console.log("[Drive] FOLDER:", process.env.GOOGLE_DRIVE_FOLDER_ID);

  const base64Clean = base64Data.includes(",")
    ? base64Data.split(",")[1]
    : base64Data;
  const buffer = Buffer.from(base64Clean, "base64");

  if (!DRIVE_FOLDER_ID) {
    console.error("[Drive] GOOGLE_DRIVE_FOLDER_ID no está definido");
    throw new Error("GOOGLE_DRIVE_FOLDER_ID es requerido para subir fotos");
  }
  console.log("[Drive] Uploading file:", fileName, "size:", buffer.length, "bytes", "folder:", DRIVE_FOLDER_ID);

  if (SERVICE_ACCOUNT_EMAIL && PRIVATE_KEY && DRIVE_FOLDER_ID) {
    try {
      const { google } = await import("googleapis");
      const auth = new google.auth.GoogleAuth({
        credentials: {
          client_email: SERVICE_ACCOUNT_EMAIL,
          private_key: PRIVATE_KEY,
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

  throw new Error(
    "Configura GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY y GOOGLE_DRIVE_FOLDER_ID en .env para subir fotos a Drive"
  );
}
