import mongoose from "mongoose";
const kitSchema = new mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:false,index:true},
  inputHash:{type:String,index:true},
  input:{jd:String,company_url:String,days:Number},
  kit:{type:mongoose.Schema.Types.Mixed,required:true},
  baseKit:{type:mongoose.Schema.Types.Mixed,default:null},
  progress:{type:Number,default:0},
  progressStep:{type:String,default:""},
  edits:{type:mongoose.Schema.Types.Mixed,default:[]},
  practice:{type:mongoose.Schema.Types.Mixed,default:{}},
  status:{type:String,enum:["generating","ready","failed"],default:"generating"},
  error:{type:String,default:null}
},{timestamps:true});
kitSchema.index({userId:1,inputHash:1});
export const KitModel = mongoose.model("Kit", kitSchema);
