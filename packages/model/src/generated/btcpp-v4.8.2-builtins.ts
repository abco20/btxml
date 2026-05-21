// Generated from packages/model/resources/btcpp/4.8.2/btcpp_default_models.xml.
// Do not edit manually. Run `pnpm generate:btcpp-builtins`.

export type GeneratedBuiltinPort = {
  name: string;
  direction: "input" | "output" | "inout";
  type?: string;
  defaultValue?: string;
  description?: string;
  required: boolean;
  enum?: string[];
};

export type GeneratedBuiltinModel = {
  id: string;
  kind: "Action" | "Condition" | "Control" | "Decorator" | "SubTree";
  ports: GeneratedBuiltinPort[];
};

export const btcppV4_8_2BuiltinModels = [
  {
    id: "AlwaysFailure",
    kind: "Action",
    ports: [],
  },
  {
    id: "AlwaysSuccess",
    kind: "Action",
    ports: [],
  },
  {
    id: "AsyncFallback",
    kind: "Control",
    ports: [],
  },
  {
    id: "AsyncSequence",
    kind: "Control",
    ports: [],
  },
  {
    id: "Delay",
    kind: "Decorator",
    ports: [
      {
        name: "delay_msec",
        direction: "input",
        type: "unsigned int",
        description: "Tick the child after a few milliseconds",
        required: true,
      },
    ],
  },
  {
    id: "Fallback",
    kind: "Control",
    ports: [],
  },
  {
    id: "ForceFailure",
    kind: "Decorator",
    ports: [],
  },
  {
    id: "ForceSuccess",
    kind: "Decorator",
    ports: [],
  },
  {
    id: "IfThenElse",
    kind: "Control",
    ports: [],
  },
  {
    id: "Inverter",
    kind: "Decorator",
    ports: [],
  },
  {
    id: "KeepRunningUntilFailure",
    kind: "Decorator",
    ports: [],
  },
  {
    id: "LoopBool",
    kind: "Decorator",
    ports: [
      {
        name: "value",
        direction: "output",
        type: "bool",
        required: false,
      },
      {
        name: "if_empty",
        direction: "input",
        type: "BT::NodeStatus",
        defaultValue: "SUCCESS",
        description: "Status to return if queue is empty: SUCCESS, FAILURE, SKIPPED",
        required: false,
      },
      {
        name: "queue",
        direction: "inout",
        type: "std::shared_ptr<std::deque<bool, std::allocator<bool> > >",
        required: true,
      },
    ],
  },
  {
    id: "LoopDouble",
    kind: "Decorator",
    ports: [
      {
        name: "value",
        direction: "output",
        type: "double",
        required: false,
      },
      {
        name: "if_empty",
        direction: "input",
        type: "BT::NodeStatus",
        defaultValue: "SUCCESS",
        description: "Status to return if queue is empty: SUCCESS, FAILURE, SKIPPED",
        required: false,
      },
      {
        name: "queue",
        direction: "inout",
        type: "std::shared_ptr<std::deque<double, std::allocator<double> > >",
        required: true,
      },
    ],
  },
  {
    id: "LoopInt",
    kind: "Decorator",
    ports: [
      {
        name: "value",
        direction: "output",
        type: "int",
        required: false,
      },
      {
        name: "if_empty",
        direction: "input",
        type: "BT::NodeStatus",
        defaultValue: "SUCCESS",
        description: "Status to return if queue is empty: SUCCESS, FAILURE, SKIPPED",
        required: false,
      },
      {
        name: "queue",
        direction: "inout",
        type: "std::shared_ptr<std::deque<int, std::allocator<int> > >",
        required: true,
      },
    ],
  },
  {
    id: "LoopString",
    kind: "Decorator",
    ports: [
      {
        name: "value",
        direction: "output",
        type: "std::string",
        required: false,
      },
      {
        name: "if_empty",
        direction: "input",
        type: "BT::NodeStatus",
        defaultValue: "SUCCESS",
        description: "Status to return if queue is empty: SUCCESS, FAILURE, SKIPPED",
        required: false,
      },
      {
        name: "queue",
        direction: "inout",
        type: "std::shared_ptr<std::deque<std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> >, std::allocator<std::__cxx11::basic_string<char, std::char_traits<char>, std::allocator<char> > > > >",
        required: true,
      },
    ],
  },
  {
    id: "Parallel",
    kind: "Control",
    ports: [
      {
        name: "failure_count",
        direction: "input",
        type: "int",
        defaultValue: "1",
        description: "number of children that need to fail to trigger a FAILURE",
        required: false,
      },
      {
        name: "success_count",
        direction: "input",
        type: "int",
        defaultValue: "-1",
        description: "number of children that need to succeed to trigger a SUCCESS",
        required: false,
      },
    ],
  },
  {
    id: "ParallelAll",
    kind: "Control",
    ports: [
      {
        name: "max_failures",
        direction: "input",
        type: "int",
        defaultValue: "1",
        description:
          "If the number of children returning FAILURE exceeds this value, ParallelAll returns FAILURE",
        required: false,
      },
    ],
  },
  {
    id: "Precondition",
    kind: "Decorator",
    ports: [
      {
        name: "else",
        direction: "input",
        type: "BT::NodeStatus",
        defaultValue: "FAILURE",
        description: "Return status if condition is false",
        required: false,
      },
      {
        name: "if",
        direction: "input",
        type: "std::string",
        required: true,
      },
    ],
  },
  {
    id: "ReactiveFallback",
    kind: "Control",
    ports: [],
  },
  {
    id: "ReactiveSequence",
    kind: "Control",
    ports: [],
  },
  {
    id: "Repeat",
    kind: "Decorator",
    ports: [
      {
        name: "num_cycles",
        direction: "input",
        type: "int",
        description: "Repeat a successful child up to N times. Use -1 to create an infinite loop.",
        required: true,
      },
    ],
  },
  {
    id: "RetryUntilSuccessful",
    kind: "Decorator",
    ports: [
      {
        name: "num_attempts",
        direction: "input",
        type: "int",
        description:
          "Execute again a failing child up to N times. Use -1 to create an infinite loop.",
        required: true,
      },
    ],
  },
  {
    id: "RunOnce",
    kind: "Decorator",
    ports: [
      {
        name: "then_skip",
        direction: "input",
        type: "bool",
        defaultValue: "true",
        description:
          "If true, skip after the first execution, otherwise return the same NodeStatus returned once by the child.",
        required: false,
      },
    ],
  },
  {
    id: "Script",
    kind: "Action",
    ports: [
      {
        name: "code",
        direction: "input",
        type: "std::string",
        description: "Piece of code that can be parsed",
        required: true,
      },
    ],
  },
  {
    id: "ScriptCondition",
    kind: "Condition",
    ports: [
      {
        name: "code",
        direction: "input",
        type: "BT::AnyTypeAllowed",
        description: "Piece of code that can be parsed. Must return false or true",
        required: true,
      },
    ],
  },
  {
    id: "Sequence",
    kind: "Control",
    ports: [],
  },
  {
    id: "SequenceWithMemory",
    kind: "Control",
    ports: [],
  },
  {
    id: "SetBlackboard",
    kind: "Action",
    ports: [
      {
        name: "output_key",
        direction: "inout",
        type: "BT::AnyTypeAllowed",
        description: "Name of the blackboard entry where the value should be written",
        required: true,
      },
      {
        name: "value",
        direction: "input",
        type: "BT::AnyTypeAllowed",
        description: "Value to be written into the output_key",
        required: true,
      },
    ],
  },
  {
    id: "SkipUnlessUpdated",
    kind: "Decorator",
    ports: [
      {
        name: "entry",
        direction: "input",
        type: "BT::Any",
        description: "Entry to check",
        required: true,
      },
    ],
  },
  {
    id: "Sleep",
    kind: "Action",
    ports: [
      {
        name: "msec",
        direction: "input",
        type: "unsigned int",
        required: true,
      },
    ],
  },
  {
    id: "Switch2",
    kind: "Control",
    ports: [
      {
        name: "case_2",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_1",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "variable",
        direction: "input",
        type: "std::string",
        required: true,
      },
    ],
  },
  {
    id: "Switch3",
    kind: "Control",
    ports: [
      {
        name: "case_3",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_2",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_1",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "variable",
        direction: "input",
        type: "std::string",
        required: true,
      },
    ],
  },
  {
    id: "Switch4",
    kind: "Control",
    ports: [
      {
        name: "case_4",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_3",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_2",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_1",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "variable",
        direction: "input",
        type: "std::string",
        required: true,
      },
    ],
  },
  {
    id: "Switch5",
    kind: "Control",
    ports: [
      {
        name: "case_5",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_4",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_3",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_2",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_1",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "variable",
        direction: "input",
        type: "std::string",
        required: true,
      },
    ],
  },
  {
    id: "Switch6",
    kind: "Control",
    ports: [
      {
        name: "case_5",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_4",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_6",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_3",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_2",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "case_1",
        direction: "input",
        type: "std::string",
        required: true,
      },
      {
        name: "variable",
        direction: "input",
        type: "std::string",
        required: true,
      },
    ],
  },
  {
    id: "Timeout",
    kind: "Decorator",
    ports: [
      {
        name: "msec",
        direction: "input",
        type: "unsigned int",
        description: "After a certain amount of time, halt() the child if it is still running.",
        required: true,
      },
    ],
  },
  {
    id: "UnsetBlackboard",
    kind: "Action",
    ports: [
      {
        name: "key",
        direction: "input",
        type: "std::string",
        description: "Key of the entry to remove",
        required: true,
      },
    ],
  },
  {
    id: "WaitValueUpdate",
    kind: "Decorator",
    ports: [
      {
        name: "entry",
        direction: "input",
        type: "BT::Any",
        description: "Entry to check",
        required: true,
      },
    ],
  },
  {
    id: "WasEntryUpdated",
    kind: "Action",
    ports: [
      {
        name: "entry",
        direction: "input",
        type: "BT::Any",
        description: "Entry to check",
        required: true,
      },
    ],
  },
  {
    id: "WhileDoElse",
    kind: "Control",
    ports: [],
  },
] as const satisfies readonly GeneratedBuiltinModel[];

export const btcppV4_8_2GenericSubTreeModel = {
  id: "SubTree",
  kind: "SubTree",
  ports: [
    {
      name: "_autoremap",
      direction: "input",
      type: "bool",
      defaultValue: "false",
      description: "If true, all the ports with the same name will be remapped",
      required: false,
    },
  ],
} as const satisfies GeneratedBuiltinModel;
