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
        "Content-Type: image/jpeg\r\n" +
        "Content-Transfer-Encoding: base64\r\n\r\n"
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
    throw new Error(`Google Drive upload failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  return {
    fileId: data.id,
    webViewLink: `https://drive.google.com/file/d/${data.id}/view`,
  };
}
