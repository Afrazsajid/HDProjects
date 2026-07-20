import { NextResponse } from "next/server";
import { hashToken, cancelFutureAttendanceMessages } from "@/src/lib/check-in";
import { prisma } from "@/src/lib/prisma";

export async function POST(request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const tokenHash = hashToken(token);
  const tokenRow = await prisma.checkInToken.findUnique({ where: { tokenHash } });
  if (!tokenRow || tokenRow.expiresAt < new Date()) {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }
  const form = await request.formData();
  const response = String(form.get("response") ?? "");
  const estimatedArrival = String(form.get("estimatedArrival") ?? "");
  const notes = String(form.get("notes") ?? "");

  if (!tokenRow.usedAt) {
    const now = new Date();
    await prisma.attendanceResponse.create({
      data: {
        shiftId: tokenRow.shiftId,
        workerId: tokenRow.workerId,
        tokenHash,
        response,
        estimatedArrival: estimatedArrival || null,
        issueType: response === "Need assistance" ? "ASSISTANCE" : response === "Unable to attend" ? "UNABLE_TO_ATTEND" : null,
        notes: notes || null,
        submittedAt: now,
      },
    }).catch(() => null);
    await prisma.checkInToken.update({ where: { tokenHash }, data: { usedAt: now } });
    if (response === "Yes, on site") {
      const shift = await prisma.shift.update({
        where: { id: tokenRow.shiftId },
        data: { status: "CHECKED_IN", checkedInAt: now, checkedInSource: "FORM" },
      });
      await cancelFutureAttendanceMessages(tokenRow.shiftId, "Checked in via attendance form");
      await prisma.auditLog.create({
        data: {
          actorType: "FORM",
          action: "SHIFT_CHECKED_IN",
          entityType: "Shift",
          entityId: tokenRow.shiftId,
          afterJson: JSON.stringify(shift),
          metadataJson: JSON.stringify({ workerId: tokenRow.workerId }),
        },
      });
    }
  }
  return NextResponse.redirect(new URL(`/check-in/${token}?submitted=1`, request.url), { status: 303 });
}
