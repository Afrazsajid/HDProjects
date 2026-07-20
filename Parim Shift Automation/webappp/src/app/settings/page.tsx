import { connection } from "next/server";
import { PageHeading } from "@/src/components/page-heading";
import { Card, CardContent, CardHeader, CardTitle, Input, Button } from "@/src/components/ui/primitives";
import { prisma } from "@/src/lib/prisma";
import { env } from "@/src/lib/env";

export default async function SettingsPage() {
  await connection();
  const settings = await prisma.appSetting.findMany({ orderBy: { key: "asc" } });
  return (
    <>
      <PageHeading title="Settings" description="Operational defaults for timezone, retries, rate limits, emergency pause and integration status." />
      <Card>
        <CardHeader><CardTitle>Messaging Controls</CardTitle></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-zinc-300">Timezone<Input readOnly value={env.DEFAULT_TIMEZONE} /></label>
          <label className="space-y-2 text-sm text-zinc-300">Overdue Grace Minutes<Input readOnly value={env.SCHEDULER_OVERDUE_GRACE_MINUTES} /></label>
          <label className="space-y-2 text-sm text-zinc-300">OpenWA Max Messages Per Minute<Input readOnly value={env.OPENWA_MAX_MESSAGES_PER_MINUTE} /></label>
          <label className="space-y-2 text-sm text-zinc-300">Minimum Delay ms<Input readOnly value={env.OPENWA_MIN_DELAY_MS} /></label>
          <Button type="button" className="md:col-span-2">Save Settings</Button>
        </CardContent>
      </Card>
      <Card className="mt-6">
        <CardHeader><CardTitle>Stored App Settings</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {settings.map((setting) => (
            <div key={setting.id} className="flex justify-between rounded-md border border-[#242424] px-3 py-2">
              <span className="text-zinc-400">{setting.key}</span>
              <span className="font-mono text-zinc-200">{setting.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
