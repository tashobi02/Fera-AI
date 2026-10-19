// The route module exports only Next's supported route handlers and config.
import { defineRoute } from "../../_shared";
import { importRoute } from "./handler";

export const runtime = "nodejs"; // pg
export const POST = importRoute(defineRoute);
