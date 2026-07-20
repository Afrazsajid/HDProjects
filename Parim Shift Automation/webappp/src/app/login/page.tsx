import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, Button, Input } from "@/src/components/ui/primitives";

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-md items-center">
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-[#c8a45d]" aria-hidden="true" />
            <CardTitle>Admin Login</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <form action="/api/auth/login" method="post" className="space-y-3">
            <label className="block space-y-2 text-sm text-zinc-300">Email<Input name="email" type="email" autoComplete="email" required /></label>
            <label className="block space-y-2 text-sm text-zinc-300">Password<Input name="password" type="password" autoComplete="current-password" required /></label>
            <Button type="submit" className="w-full">Sign In</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
