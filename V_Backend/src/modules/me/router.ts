import { Router } from "express";
import { getMe, setActiveMember } from "./service";

export function meRouter() {
  const r = Router();

  r.get("/", (req, res) => {
    const me = getMe(req);
    res.json(me);
  });

  // Switch active member for this user/session
  r.post("/active-member", (req, res) => {
    const out = setActiveMember(req, req.body);
    res.json(out);
  });

  r.post("/daily-contract/accept", async (req, res) => {
    const { contractId } = req.body ?? {};
    // TODO: persist accepted status in DB (phase v1 can be in-memory or store in user/day table)
    return res.json({ ok: true });
  });
  
  r.post("/daily-contract/adjust", async (req, res) => {
    // bounded changes: target +-20%, cuisine lock, swap protein/fiber
    return res.json({ ok: true });
  });
  

  return r;
}
