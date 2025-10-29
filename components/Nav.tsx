import Link from "next/link"

const links = [
  { href: "/", label: "Home" },
  { href: "/compendium", label: "Compendium" },
  { href: "/discover", label: "Discover" },
  { href: "/inventory", label: "Inventory" },
  // { href: "/login", label: "Login" },   // unhide if you want it visible
  // { href: "/unlock", label: "Admin" },  // keep hidden from testers if desired
]

export default function Nav() {
  return (
    <nav className="w-full border-b bg-white/80 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 h-12 flex items-center gap-4">
        <Link href="/" className="font-semibold hover:opacity-80">WhatToFlie</Link>
        <div className="flex items-center gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="opacity-80 hover:opacity-100">
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  )
}
