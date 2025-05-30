import { Request, Response, NextFunction } from "express";
import { getStorage } from "../../storage";
import { JWTService } from "../services/jwt.service";

declare module "express" {
  interface Request {
    user?: {
      id: number;
      username: string;
      role: string;
      company_id?: number;
    };
    memberPath?: string;
    filePath?: string;
  }
}

/**
 * JWT-based authentication middleware
 * 
 * Extracts and verifies JWT token from request headers.
 * Sets req.user if valid token is provided.
 */
export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = JWTService.extractTokenFromRequest(req);
    
    if (!token) {
      return res.status(401).json({ 
        message: "Unauthorized: No token provided",
        code: "NO_TOKEN"
      });
    }

    const decoded = JWTService.verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ 
        message: "Unauthorized: Invalid token",
        code: "INVALID_TOKEN"
      });
    }

    if (decoded.type !== 'access') {
      return res.status(401).json({ 
        message: "Unauthorized: Invalid token type",
        code: "INVALID_TOKEN_TYPE"
      });
    }    // Set user information from token
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role,
      company_id: decoded.company_id
    };

    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(401).json({ 
      message: "Unauthorized: Token verification failed",
      code: "TOKEN_VERIFICATION_FAILED"
    });
  }
};

export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: "Forbidden: Admin access required" });
  }
  next();
};

/**
 * Company-based segment validation middleware
 * 
 * Validates that users can only access segments that belong to their company.
 * Should be used on any endpoint that accepts a segmentId parameter.
 */
export const validateSegmentAccess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip validation for admins without company_id (they have global access)
    if (req.user?.role === 'admin' && !req.user.company_id) {
      return next();
    }

    // Users must have a company_id to access segment-restricted data
    if (!req.user?.company_id) {
      return res.status(403).json({ 
        message: "Access denied: User must be assigned to a company" 
      });
    }

    // Extract segmentId from various possible locations
    let segmentId: number | undefined;
    
    // Check query parameters
    if (req.query.segmentId) {
      segmentId = parseInt(req.query.segmentId as string);
    }
    // Check body parameters
    else if (req.body.segmentId) {
      segmentId = parseInt(req.body.segmentId as string);
    }
    // Check URL parameters
    else if (req.params.segmentId) {
      segmentId = parseInt(req.params.segmentId as string);
    }

    // If no segmentId is provided, allow the request (some operations may not require segment)
    if (!segmentId || isNaN(segmentId)) {
      return next();
    }    // Validate that the segment belongs to the user's company
    const dbStorage = await getStorage();
    const segment = await dbStorage.getSegmentById(segmentId);
    
    if (!segment) {
      return res.status(404).json({ message: "Segment not found" });
    }

    if (segment.company_id !== req.user.company_id) {
      return res.status(403).json({ 
        message: "Access denied: Segment does not belong to your company" 
      });
    }

    // Segment is valid for this user's company
    next();
  } catch (error) {
    console.error("Error in validateSegmentAccess middleware:", error);
    return res.status(500).json({ message: "Internal server error during segment validation" });
  }
};

/**
 * Company-based data filtering middleware
 * 
 * Ensures that data queries are automatically filtered by the user's company segments.
 * Adds valid segment IDs to the request for use by storage methods.
 */
export const companyDataFilter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Skip for admins without company_id (they have global access)
    if (req.user?.role === 'admin' && !req.user.company_id) {
      return next();
    }

    // Users must have a company_id
    if (!req.user?.company_id) {
      return res.status(403).json({ 
        message: "Access denied: User must be assigned to a company" 
      });
    }    // Get all segments for the user's company
    const dbStorage = await getStorage();
    const userSegments = await dbStorage.getAllSegmentsByCompany(req.user.company_id);
    const validSegmentIds = userSegments.map((segment: any) => segment.id);

    // Add company segments to request for use by route handlers
    (req as any).userCompanySegments = validSegmentIds;
    (req as any).userCompanyId = req.user.company_id;

    next();
  } catch (error) {
    console.error("Error in companyDataFilter middleware:", error);
    return res.status(500).json({ message: "Internal server error during company data filtering" });
  }
};