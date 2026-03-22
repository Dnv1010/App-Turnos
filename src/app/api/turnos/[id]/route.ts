import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { turnoEventEmitter } from "../stream-sse/route";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    if (session.user.role !== "COORDINADOR" && session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Solo coordinadores y admins pueden eliminar turnos" },
        { status: 403 }
      );
    }

    const turnoId = params.id;

    const turnoAnterior = await prisma.turno.findUnique({
      where: { id: turnoId },
      include: { user: { select: { zona: true } } },
    });

    if (!turnoAnterior) {
      return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
    }

    await prisma.turno.delete({
      where: { id: turnoId },
    });

    console.log("Turno eliminado:", turnoId);

    turnoEventEmitter.emit("turno-eliminado", {
      id: turnoId,
      usuarioTecnico: turnoAnterior.userId,
      fecha: turnoAnterior.fecha.toISOString().split("T")[0],
      zona: turnoAnterior.user.zona,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message: "Turno eliminado exitosamente",
      id: turnoId,
    });
  } catch (error) {
    console.error("Error al eliminar turno:", error);
    return NextResponse.json(
      { error: "Error al eliminar turno", details: error instanceof Error ? error.message : "" },
      { status: 500 }
    );
  }
}