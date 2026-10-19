// Shared point-count budgets for the Physical World scene (Experience 02
// and Experience 03 both render the same scene components against the
// same budget, so a change here can never let total point counts drift
// apart between the two experiences).

export interface PointBudget {
  life: number;
  machine: number;
  environment: number;
  structural: number;
  bridge: number;
}

export const DESKTOP_BUDGET: PointBudget = {
  life: 180,
  machine: 60,
  environment: 220,
  structural: 140,
  bridge: 35,
};

export const MOBILE_BUDGET: PointBudget = {
  life: 70,
  machine: 25,
  environment: 70,
  structural: 40,
  bridge: 15,
};
