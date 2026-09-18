import { Suspense } from "react";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Nav from "@/components/Nav";
import Curriculum from "@/components/Curriculum";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await currentUser();
  if (!user) redirect("/api/auth/signin");
  return (
    <>
      <Nav user={user} />
      <div className="wrap">
        <Suspense fallback={<div className="page-solo"><div className="empty"><span className="spin" /> Loading…</div></div>}>
          <Curriculum canRestore={user.isBoard} />
        </Suspense>
      </div>
    </>
  );
}
