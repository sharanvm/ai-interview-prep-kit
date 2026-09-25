import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const id = req.session.userId;
  if (!id || !mongoose.isValidObjectId(id)) return res.status(401).json({error:{code:"UNAUTHORIZED",message:"Sign in required"}});
  req.userId = id; next();
}
declare module "express-session" { interface SessionData { userId?: string } }
declare global { namespace Express { interface Request { userId?: string } } }
