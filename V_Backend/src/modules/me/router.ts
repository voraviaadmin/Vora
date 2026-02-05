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

  return r;
}
