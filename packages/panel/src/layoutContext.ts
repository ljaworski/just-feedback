import { useOutletContext } from 'react-router-dom';
import type { Project } from './api';

export interface LayoutCtx {
  projects: Project[];
  reloadProjects: () => Promise<void>;
}

export const useProjects = () => useOutletContext<LayoutCtx>();
