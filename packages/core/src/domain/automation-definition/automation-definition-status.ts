export const AUTOMATION_DEFINITION_STATUSES = ['enabled', 'disabled'] as const;

export type AutomationDefinitionStatus = (typeof AUTOMATION_DEFINITION_STATUSES)[number];

export const isAutomationDefinitionStatus = (
  value: string,
): value is AutomationDefinitionStatus => {
  return (AUTOMATION_DEFINITION_STATUSES as readonly string[]).includes(value);
};
