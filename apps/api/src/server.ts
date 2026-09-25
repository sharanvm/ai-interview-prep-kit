import express from "express";
import cors from "cors";
import session from "express-session";
import MongoStore from "connect-mongo";
import { env } from "./config/env";
import { connectDb } from "./lib/db";
import authRoutes from "./routes/auth";
import kitRoutes from "./routes/kits";

if(env.NODE_ENV==="production" && env.SESSION_SECRET.startsWith("development-only")) throw new Error("SESSION_SECRET must be configured in production");
const app=express();
app.disable("x-powered-by");
app.use(cors({origin:env.WEB_ORIGIN,credentials:true}));
app.use(express.json({limit:"2mb"}));
app.use(session({secret:env.SESSION_SECRET,store:MongoStore.create({mongoUrl:env.MONGODB_URI,ttl:60*60*24*7}),resave:false,saveUninitialized:false,cookie:{httpOnly:true,secure:env.NODE_ENV==="production",sameSite:env.NODE_ENV==="production"?"none":"lax",maxAge:1000*60*60*24*7}}));
app.get("/health",(_,res)=>res.json({ok:true}));
app.use("/api/auth",authRoutes);
app.use("/api/kits",kitRoutes);
app.use((err:any,_req:any,res:any,_next:any)=>{console.error(err);res.status(err.status||500).json({error:{code:err.code||"INTERNAL_ERROR",message:err.message||"Unexpected error"}})});

connectDb().then(()=>app.listen(env.API_PORT,()=>console.log(`API listening on ${env.API_PORT}`))).catch(err=>{console.error("Database connection failed",err);process.exit(1)});
