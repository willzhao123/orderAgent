export const SKILL_PARAMETERS: Record<string, Record<string, unknown>> = {
  check_menu_item: {
    type: "object",
    properties: {
      item_name: {
        type: "string",
        description: "The food item the customer is asking about."
      }
    },
    required: ["item_name"],
    additionalProperties: false
  },
  list_food: {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: false
  }
};
