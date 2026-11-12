import { NextResponse } from "next/server";
import { deleteService, findService, linkSetlist } from "@/db/attendance";
import { loadSetlists } from "@/db/setlists";
import { gate } from "@/lib/sessionGate";
import { figures, type ServiceDetail } from "@/lib/attendanceView";

export const runtime = "nodejs";

const GONE = "That service is gone — go back to Attendance";
const DENIED = "Deleting a service needs the admin PIN";

/** Route params arrive as a promise in this version of Next. */
async function serviceId(params: Promise<{ id: string }>): Promise<number | null> {
  const id = Number((await params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

type Context = { params: Promise<{ id: string }> };

/** GET /api/attendance/:id — one service: every reading, the half-hour ones, the average and peak, and the service order used. */
export async function GET(_req: Request, { params }: Context) {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  const id = await serviceId(params);
  const entry = id === null ? null : await findService(s.branchId, id);
  if (!entry) return NextResponse.json({ error: GONE }, { status: 404 });

  const setlists = await loadSetlists(s.branchId);
  const used = setlists.find((l) => l.id === entry.service.setlistId);
  const body: ServiceDetail = {
    branch: s.branch.name,
    admin: s.role === "admin",
    service: entry.service,
    readings: entry.readings,
    ...figures(entry),
    setlist: used ? { id: used.id, name: used.name, items: used.items.map((i) => ({ kind: i.kind, title: i.title })) } : null,
    setlists: setlists.map((l) => ({ id: l.id, name: l.name, active: l.active })),
  };
  return NextResponse.json(body);
}

/**
 * PATCH /api/attendance/:id — { setlistId } — which service order the service
 * used, or null for none. Church PIN, like the service orders themselves.
 */
export async function PATCH(req: Request, { params }: Context) {
  const s = await gate();
  if (s instanceof NextResponse) return s;
  const id = await serviceId(params);
  if (id === null) return NextResponse.json({ error: GONE }, { status: 404 });

  const body = (await req.json().catch(() => null)) as { setlistId?: unknown } | null;
  const setlistId = body?.setlistId;
  if (setlistId !== null && !(typeof setlistId === "number" && Number.isInteger(setlistId) && setlistId > 0)) {
    return NextResponse.json({ error: "Choose a service order, or none" }, { status: 400 });
  }

  const result = await linkSetlist(s.branchId, id, setlistId);
  if (result === "gone") return NextResponse.json({ error: GONE }, { status: 404 });
  if (result === "no-setlist") return NextResponse.json({ error: "That service order is gone — reload the page" }, { status: 400 });
  return NextResponse.json({ ok: true, service: result });
}

/** DELETE /api/attendance/:id — admin. For a sound check or a test that went out on air; the readings go with it. */
export async function DELETE(_req: Request, { params }: Context) {
  const s = await gate(DENIED);
  if (s instanceof NextResponse) return s;
  const id = await serviceId(params);
  if (id === null || !(await deleteService(s.branchId, id))) return NextResponse.json({ error: GONE }, { status: 404 });
  return NextResponse.json({ ok: true });
}
