import { connection } from "next/server";
import { CheckCircle2 } from "lucide-react";
import { PageHeading } from "@/src/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle, Button, Input, Textarea, Badge } from "@/src/components/ui/primitives";
import { hashToken } from "@/src/lib/check-in";
import { prisma } from "@/src/lib/prisma";
import { formatDisplayTime } from "@/src/lib/date-time";

export default async function CheckInPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ submitted?: string }>;
}) {
  await connection();
  const { token } = await params;
  const query = await searchParams;
  const tokenRow = await prisma.checkInToken.findUnique({ where: { tokenHash: hashToken(token) } });
  const shift = tokenRow
    ? await prisma.shift.findUnique({ where: { id: tokenRow.shiftId }, include: { worker: true, location: true } })
    : null;
  const expired = !tokenRow || tokenRow.expiresAt < new Date();
  const submitted = query.submitted === "1" || Boolean(tokenRow?.usedAt);

  return (
    <div className="mx-auto max-w-xl py-8">
      <PageHeading title="Shift Check-In" description="Confirm your attendance status for H&D Recruitment." />
      <Card>
        <CardHeader>
          <CardTitle>{shift ? `${shift.worker.fullName} · ${shift.location.name}` : "Check-in unavailable"}</CardTitle>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <div className="rounded-md border border-emerald-900 bg-emerald-950/30 p-5 text-center">
              <CheckCircle2 className="mx-auto size-10 text-emerald-300" aria-hidden="true" />
              <p className="mt-3 text-lg font-semibold text-white">Your response has been recorded.</p>
              <p className="mt-1 text-sm text-zinc-400">Thank you. Future check-in reminders for this shift have been stopped where applicable.</p>
            </div>
          ) : expired || !shift ? (
            <div className="rounded-md border border-red-900 bg-red-950/30 p-5">
              <p className="font-semibold text-red-200">This check-in link is invalid or has expired.</p>
              <p className="mt-1 text-sm text-zinc-400">Please contact the H&D operations team if you still need assistance.</p>
            </div>
          ) : (
            <form action={`/api/check-in/${token}`} method="post" className="space-y-4">
              <div className="grid gap-3 rounded-md border border-[#242424] p-3 text-sm text-zinc-300">
                <div className="flex justify-between gap-4"><span>Shift time</span><Badge>{formatDisplayTime(shift.startAtUtc)} - {formatDisplayTime(shift.endAtUtc)}</Badge></div>
                <div className="flex justify-between gap-4"><span>Position</span><span>{shift.position}</span></div>
              </div>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-white">Are you on site?</legend>
                {["Yes, on site", "Running late", "Unable to attend", "Need assistance"].map((option) => (
                  <label key={option} className="flex min-h-11 items-center gap-3 rounded-md border border-[#333] px-3 text-sm text-zinc-200">
                    <input type="radio" name="response" value={option} required className="size-4 accent-[#c8a45d]" />
                    {option}
                  </label>
                ))}
              </fieldset>
              <label className="block space-y-2 text-sm text-zinc-300">
                Estimated arrival time
                <Input name="estimatedArrival" placeholder="For example, 07:10" />
              </label>
              <label className="block space-y-2 text-sm text-zinc-300">
                Optional notes
                <Textarea name="notes" placeholder="Add any issue or instruction for the operations team" />
              </label>
              <Button type="submit" className="w-full">Submit Check-In</Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
