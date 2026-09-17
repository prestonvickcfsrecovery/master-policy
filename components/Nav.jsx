"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGES = [
  { href: "/", label: "Policy" },
  { href: "/ask", label: "Ask" },
  { href: "/changes", label: "Changes" },
];

export default function Nav({ user }) {
  const path = usePathname();
  const on = (href) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <header className="top">
      <div className="top-in">
        <Link className="brand" href="/">
          <span className="spectrum" aria-hidden="true">
            <i style={{ background: "#2D7D6B" }} /><i style={{ background: "#2E6F8E" }} />
            <i style={{ background: "#6B4E9E" }} /><i style={{ background: "#1B7A45" }} />
            <i style={{ background: "#A03A6B" }} />
          </span>
          <span><b>Master Program Policy</b><span>CFS Recovery · internal</span></span>
        </Link>
        <nav className="pages">
          {PAGES.map((p) => (
            <Link key={p.href} href={p.href} className={on(p.href) ? "on" : ""}>{p.label}</Link>
          ))}
        </nav>
        <div className="who">
          {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : null}
          <span>{user?.name || ""}</span>
          <span className="role">{user?.isBoard ? "Policy owner" : "Team"}</span>
          <a className="linkish" href="/api/auth/signout" style={{ marginLeft: 4 }}>Sign out</a>
        </div>
      </div>
    </header>
  );
}
