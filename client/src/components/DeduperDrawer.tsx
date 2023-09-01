import React, { useContext, createContext } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import StepContent from "@mui/material/StepContent";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import StepIcon, { StepIconProps } from "@mui/material/StepIcon";
import { CircularProgress, Grow } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ErrorIcon from "@mui/icons-material/Error";
import { ActiveTaskType, AppContext } from "utils/AppContext";
import { useMatch } from "react-router-dom";
import { prettyDuration } from "utils";

const drawerWidth = 240;

export default function DeduperDrawer() {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: drawerWidth,
          boxSizing: "border-box",
          borderRight: "none",
        },
      }}
    >
      <Box sx={{ overflow: "auto", p: 1, pt: 9 }}>
        <DeduperStepper />
      </Box>
    </Drawer>
  );
}

interface StepLinkType {
  href: string;
  reloadDocument?: boolean;
}

interface StepType {
  number: number;
  label: string;
  isEnabled: boolean; // Is this step enabled (button works)?
  isInProgress: boolean; // Is this step in progress (spinner)?
  isCompleted: boolean; // Is this step completed (checkmark)?
  isFailed: boolean; // Is this step failed (red X)?
  content?: React.ReactNode;
  link?: StepLinkType;
}

const stepDefaults = {
  number: 0,
  label: "",
  isEnabled: false,
  isInProgress: false,
  isCompleted: false,
  isFailed: false,
};

const defaultSteps: Array<StepType> = [
  {
    ...stepDefaults,
    number: 1,
    label: "Authorize",
    link: { href: "/auth/google", reloadDocument: true },
    isEnabled: true,
  },
  {
    ...stepDefaults,
    number: 2,
    label: "Select Options",
    link: { href: "/task_options" },
  },
  {
    ...stepDefaults,
    number: 3,
    label: "Process Duplicates",
    link: { href: "/active_task" },
  },
  {
    ...stepDefaults,
    number: 4,
    label: "Review and Delete Duplicates",
    link: { href: "/active_task/results" },
  },
];

const DeduperStepContext = createContext<StepType>(stepDefaults);

function DeduperStepper() {
  const { isLoggedIn, user, activeTask } = useContext(AppContext);

  const steps = structuredClone(defaultSteps);

  if (isLoggedIn) {
    steps[0] = {
      ...steps[0],
      isCompleted: true,
      content: `Logged in as ${user?.email}`,
    };
    steps[1].isEnabled = true;
  }
  if (activeTask) {
    steps[1].isCompleted = true;
    steps[2].isEnabled = true;
    if (["SENT", "PROGRESS"].includes(activeTask?.status)) {
      steps[2].isInProgress = true;
    } else if (activeTask?.status == "SUCCESS") {
      steps[2].isCompleted = true;
      steps[3].isEnabled = true;
    } else if (activeTask?.status == "FAILURE") {
      steps[2].isFailed = true;
    }
    if (activeTask.meta?.steps) {
      activeTask.meta.steps;
      steps[2].content = (
        <>
          {Object.entries(activeTask.meta.steps).map(([step, info]) => {
            return <DeduperTaskStep key={step} {...{ step, info }} />;
          })}
        </>
      );
    }
  }

  const maxEnabledStep = steps.reduce(
    (maxIndex, step, i) => (step.isEnabled ? i : maxIndex),
    0
  );

  return (
    <Stepper
      orientation="vertical"
      activeStep={maxEnabledStep}
      sx={{
        [`& .MuiStepContent-root, & .MuiStepConnector-root`]: {
          // Adjust alignment with an unexpected button inside steps
          marginLeft: "19px",
        },
      }}
    >
      {steps.map((step, index) => (
        <Step key={step.label} expanded={true} active={index <= maxEnabledStep}>
          <DeduperStepContent key={step.label} {...step}>
            {step.content}
          </DeduperStepContent>
        </Step>
      ))}
    </Stepper>
  );
}

function DeduperStepContent(props: StepType & { children?: React.ReactNode }) {
  const { label, link, isEnabled, children } = props;

  const isActive = useMatch(link?.href);

  return (
    <DeduperStepContext.Provider value={{ ...props }}>
      <Button
        variant={isActive ? "outlined" : "text"}
        size="small"
        sx={{ p: 1 }}
        href={link?.href}
        reloadDocument={link?.reloadDocument}
        disabled={!isEnabled}
      >
        <StepLabel sx={{ py: 0 }} StepIconComponent={DeduperStepIcon}>
          {label}
        </StepLabel>
      </Button>
      <StepContent TransitionComponent={Grow}>
        <Typography variant="body2" component="div">
          {children}
        </Typography>
      </StepContent>
    </DeduperStepContext.Provider>
  );
}

function DeduperStepIcon({ active, completed, className }: StepIconProps) {
  const { number, isInProgress, isCompleted, isFailed } =
    useContext(DeduperStepContext);

  if (isCompleted) {
    return <CheckIcon />;
  } else if (isFailed) {
    return <ErrorIcon sx={{ color: "error.main" }} />;
  } else if (isInProgress) {
    return <CircularProgress size={"24px"} />;
  }
  return <StepIcon {...{ active, completed, className }} icon={number} />;
}

type DeduperTaskStepProps = {
  step: string;
  info: NonNullable<NonNullable<ActiveTaskType["meta"]>["steps"]>[string];
};

function DeduperTaskStep({ step, info }: DeduperTaskStepProps) {
  let taskStepTitle = "";
  let countUnit = "";
  if (step === "fetch_media_items") {
    taskStepTitle = "Gather media items";
  } else if (step === "process_duplicates") {
    taskStepTitle = "Process duplicates";
    countUnit = info.count === 1 ? "group" : "groups";
  }
  if (info.startedAt) {
    const start = Date.parse(info.startedAt);
    const end = info.completedAt
      ? Date.parse(info.completedAt)
      : new Date().getTime();
    const duration = Math.round((end - start) / 1000);
    const count = info.count;
    return (
      <>
        <Typography variant="body2" sx={{ pt: 2 }}>
          {info.completedAt ? (
            <CheckIcon fontSize="inherit" color="primary" />
          ) : (
            <CircularProgress size={"1em"} />
          )}{" "}
          {taskStepTitle} (
          {count !== undefined &&
            `${[new Intl.NumberFormat().format(count)]} ${countUnit} in `}
          {prettyDuration(duration)})
        </Typography>
      </>
    );
  }
}
