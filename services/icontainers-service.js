/**
 * iContainers (Brutus API) Service Layer
 * Re-exports the core iContainers client from netlify/functions/lib/icontainers.js
 */

export * from "../netlify/functions/lib/icontainers.js";
import iContainersService from "../netlify/functions/lib/icontainers.js";
export default iContainersService;
