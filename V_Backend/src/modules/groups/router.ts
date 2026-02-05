import { Router } from "express";
import {
  createGroup,
  createInvite,
  joinByInviteCode,
  leaveGroup,
  removeMember,
  createChildMember,
  listMyGroups,
  changeGroupPayer,
} from "./service";

export function groupsRouter() {
  const r = Router();


  // List my groups + members (for Groups tab)
  r.get("/", (req, res) => {
    const out = listMyGroups(req);
    res.json(out);
  });



  // Create group (creator becomes Owner)
  r.post("/", (req, res) => {
    const out = createGroup(req, req.body);
    res.json(out);
  });

  // Create invite code for group
  r.post("/:groupId/invites", (req, res) => {
    const out = createInvite(req, req.params.groupId);
    res.json(out);
  });

  // Join group using inviteCode
  r.post("/join", (req, res) => {
    const out = joinByInviteCode(req, req.body);
    res.json(out);
  });

  // Leave group
  r.post("/:groupId/leave", (req, res) => {
    const out = leaveGroup(req, req.params.groupId);
    res.json(out);
  });

  // Owner removes member
  r.delete("/:groupId/members/:memberId", (req, res) => {
    const out = removeMember(req, req.params.groupId, req.params.memberId);
    res.json(out);
  });

  // FWGB only: Owner creates a child member (member record only, no user)
  r.post("/:groupId/members", (req, res) => {
    const out = createChildMember(req, req.params.groupId, req.body);
    res.json(out);
  });

  // FWGB only: Owner can change the group billing payer (effective-dated)
  r.post("/:groupId/billing/payer", (req, res) => {
    const out = changeGroupPayer(req, req.params.groupId, req.body);
    res.json(out);
  });



  return r;
}
