const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || "";
const DRIVE_API_KEY = process.env.GOOGLE_DRIVE_API_KEY || "";

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

  console.log("[Drive] Uploading file:", fileName, "size:", buffer.length, "bytes");

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
  console.log("[Drive] Upload success, id:", data.id, "link:", webViewLink);

  return {
    fileId: data.id,
    webViewLink,
  };
}
