import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import projectsRouter from "./projects";
import buildingRouter from "./building";
import dashboardRouter from "./dashboard";
import { projectVersionsRouter } from "./versions";
import versionRouter from "./versions";
import { versionProductsRouter, productRouter } from "./products";
import emissionFactorsRouter from "./emissionFactors";
import validationRouter from "./validation";
import calculationsRouter from "./calculations";
import { versionReportsRouter, reportDownloadRouter } from "./reports";
import auditRouter from "./audit";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/users", usersRouter);
router.use("/projects", projectsRouter);
router.use("/dashboard", dashboardRouter);
router.use("/projects/:projectId/building", buildingRouter);
router.use("/projects/:projectId/versions", projectVersionsRouter);
router.use("/versions", versionRouter);
router.use("/versions/:versionId/products", versionProductsRouter);
router.use("/products", productRouter);
router.use("/emission-factors", emissionFactorsRouter);
router.use("/versions", validationRouter);
router.use("/versions", calculationsRouter);
router.use("/versions", versionReportsRouter);
router.use("/reports", reportDownloadRouter);
router.use("/projects", auditRouter);

export default router;
