import { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'ds_tour_v1';

export interface TourStep {
  id: string;
  targetSelector?: string;
  title: string;
  description: string;
  placement?: 'right' | 'left' | 'top' | 'bottom' | 'center';
  cta?: { label: string; path?: string };
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to DSV OpsPulse! 👋',
    description:
      "We'll give you a 90-second tour of the key features so you can hit the ground running. You can skip at any time.",
    placement: 'center',
  },
  {
    id: 'profile',
    targetSelector: '[data-tour="nav-profile"]',
    title: 'Start Here — Complete Your Profile',
    description:
      'Add your photo, phone number, bio, and job title so your teammates know who you are. A complete profile also unlocks personalised AI insights.',
    placement: 'right',
    cta: { label: 'Go to My Profile', path: 'profile' },
  },
  {
    id: 'dashboard',
    targetSelector: '[data-tour="nav-dashboard"]',
    title: 'Dashboard — Your Mission Control',
    description:
      "Everything important at a glance: today's attendance, your open tasks, leave balance, team activity, project health, and AI alerts.",
    placement: 'right',
  },
  {
    id: 'projects',
    targetSelector: '[data-tour="nav-projects"]',
    title: 'Projects — All Delivery Work Lives Here',
    description:
      'Manage tasks, sprint boards, milestones, blockers, RAID register, and decisions — all organised by project.',
    placement: 'right',
  },
  {
    id: 'daily-work',
    targetSelector: '[data-tour="nav-daily-work"]',
    title: 'Daily Work — Keep the Team in Sync',
    description:
      'Submit a quick standup each morning (what you did, what you plan, any blockers) and an EOD report at the end of the day. Time tracking is here too.',
    placement: 'right',
  },
  {
    id: 'people',
    targetSelector: '[data-tour="nav-people"]',
    title: 'People — Attendance, Leave & Team',
    description:
      'Check in and out each day, submit WFH requests, apply for leave, browse the team directory, and view the org chart.',
    placement: 'right',
  },
  {
    id: 'reports',
    targetSelector: '[data-tour="nav-reports"]',
    title: 'Reports & AI — Smart Insights',
    description:
      'Get AI-powered analysis of delivery health, team performance, standup patterns, and blocker risk. Share reports with stakeholders in one click.',
    placement: 'right',
  },
  {
    id: 'bugs',
    targetSelector: '[data-tour="nav-bugs"]',
    title: 'Bug Reports — Track Issues End-to-End',
    description:
      'Log bugs, assign them to sprint tasks, and track them to resolution. Linked directly to your project delivery workflow.',
    placement: 'right',
  },
  {
    id: 'settings',
    targetSelector: '[data-tour="nav-settings"]',
    title: 'Settings — Make It Yours',
    description:
      'Switch between light, dark, and colour themes. Change your language, adjust font size and display density, and customise the sidebar.',
    placement: 'right',
  },
  {
    id: 'done',
    title: "You're all set! 🚀",
    description:
      "You now know your way around Delivery Sync. Don't forget to complete your profile so your teammates can connect with you. You can restart this tour any time from Help & Docs.",
    placement: 'center',
    cta: { label: 'Complete My Profile', path: 'profile' },
  },
];

interface TourContextValue {
  isActive: boolean;
  currentStep: number;
  steps: TourStep[];
  completed: boolean;
  startTour: () => void;
  endTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  resetTour: () => void;
}

const TourContext = createContext<TourContextValue>({
  isActive: false,
  currentStep: 0,
  steps: TOUR_STEPS,
  completed: false,
  startTour: () => {},
  endTour: () => {},
  nextStep: () => {},
  prevStep: () => {},
  resetTour: () => {},
});

export const useTour = () => useContext(TourContext);

export const TourProvider = ({ children }: { children: ReactNode }) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [completed, setCompleted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  const endTour = useCallback(() => {
    setIsActive(false);
    setCompleted(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {}
  }, []);

  const nextStep = useCallback(() => {
    setCurrentStep((s) => {
      if (s < TOUR_STEPS.length - 1) return s + 1;
      return s;
    });
  }, []);

  const prevStep = useCallback(() => {
    setCurrentStep((s) => (s > 0 ? s - 1 : s));
  }, []);

  // resetTour intentionally does NOT clear the localStorage flag so the
  // auto-start effect never fires again — the user explicitly chose to replay.
  const resetTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
  }, []);

  // Auto-start for first-time visitors after layout renders
  useEffect(() => {
    if (!completed) {
      const t = setTimeout(() => setIsActive(true), 1400);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Finish tour when reaching last step and pressing next
  const nextOrFinish = useCallback(() => {
    if (currentStep >= TOUR_STEPS.length - 1) {
      endTour();
    } else {
      nextStep();
    }
  }, [currentStep, endTour, nextStep]);

  return (
    <TourContext.Provider
      value={{
        isActive,
        currentStep,
        steps: TOUR_STEPS,
        completed,
        startTour,
        endTour,
        nextStep: nextOrFinish,
        prevStep,
        resetTour,
      }}
    >
      {children}
    </TourContext.Provider>
  );
};
