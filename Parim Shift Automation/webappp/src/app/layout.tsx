import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import {
  Activity,
  CalendarClock,
  ClipboardList,
  FileInput,
  History,
  MapPin,
  MessageSquare,
  Settings,
  ShieldCheck,
  Users,
  Wifi,
} from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "H&D Shift Messenger",
  description: "Localhost-first workforce shift messaging and attendance operations.",
};

const navItems: Array<{ href: Route; label: string; icon: typeof Activity }> = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/shifts", label: "Shifts", icon: CalendarClock },
  { href: "/workers", label: "Workers", icon: Users },
  { href: "/locations", label: "Locations", icon: MapPin },
  { href: "/rules", label: "Rules", icon: ClipboardList },
  { href: "/templates", label: "Templates", icon: MessageSquare },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/imports", label: "Imports", icon: FileInput },
  { href: "/whatsapp", label: "WhatsApp", icon: Wifi },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/audit", label: "Audit", icon: History },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full" suppressHydrationWarning>
        <div className="min-h-dvh bg-[#050505] text-zinc-50">
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[#2c2c2c] bg-[#0b0b0b] lg:block">
            <div className="flex h-16 items-center gap-3 border-b border-[#2c2c2c] px-5">
              <div className="flex size-10 items-center justify-center rounded-md border border-[#4a3b1b] bg-[#161309] text-[#f0d28a]">
                <ShieldCheck className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">H&D Shift</p>
                <p className="text-xs text-zinc-400">Messenger</p>
              </div>
            </div>
            <nav aria-label="Main" className="space-y-1 px-3 py-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-zinc-300 transition hover:bg-[#171717] hover:text-white focus-visible:bg-[#171717]"
                  >
                    <Icon className="size-4 text-[#c8a45d]" aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </aside>
          <div className="lg:pl-64">
            <header className="sticky top-0 z-20 border-b border-[#2c2c2c] bg-[#070707]/95 backdrop-blur">
              <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6">
                <Link href="/dashboard" className="flex items-center gap-3 lg:hidden">
                  <ShieldCheck className="size-5 text-[#c8a45d]" aria-hidden="true" />
                  <span className="text-sm font-semibold">H&D Shift Messenger</span>
                </Link>
                <div className="hidden lg:block">
                  <p className="text-xs uppercase tracking-[0.18em] text-[#c8a45d]">Operations Control</p>
                  <p className="text-sm text-zinc-400">Europe/London schedule, UTC storage, localhost OpenWA</p>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-[#2c2c2c] bg-[#111] px-3 py-2 text-xs text-zinc-300">
                  <span className="size-2 rounded-full bg-emerald-400" aria-hidden="true" />
                  Worker process required
                </div>
              </div>
              <nav aria-label="Mobile" className="flex gap-1 overflow-x-auto border-t border-[#1e1e1e] px-3 py-2 lg:hidden">
                {navItems.slice(0, 8).map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.href} href={item.href} className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-zinc-300 hover:bg-[#171717]">
                      <Icon className="size-5" aria-label={item.label} />
                    </Link>
                  );
                })}
              </nav>
            </header>
            <main className="px-4 py-6 sm:px-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
