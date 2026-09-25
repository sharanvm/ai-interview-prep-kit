import mongoose from "mongoose";
import { env } from "../config/env";
export async function connectDb() { await mongoose.connect(env.MONGODB_URI); }
