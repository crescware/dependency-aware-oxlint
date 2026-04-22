import { item } from "./item.js";
import { userSanctuary } from "./user.js";

console.log("allowed: this file is the sanctuary root");

export const formSchema = { user: userSanctuary, item };
