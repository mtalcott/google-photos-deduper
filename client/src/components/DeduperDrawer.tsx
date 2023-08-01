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
import Check from "@mui/icons-material/Check";
import { AppContext } from "utils/AppContext";
import { useMatch } from "react-router-dom";

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
  content?: React.ReactNode;
  link?: StepLinkType;
}

const stepDefaults = {
  number: 0,
  label: "",
  isEnabled: false,
  isInProgress: false,
  isCompleted: false,
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
    if (["PENDING", "PROGRESS"].includes(activeTask?.status)) {
      steps[2].isInProgress = true;
    } else if (activeTask?.status == "SUCCESS") {
      steps[2].isCompleted = true;
      steps[3].isEnabled = true;
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
          <DeduperStepContent key={step.label} {...step} />
        </Step>
      ))}
    </Stepper>
  );
}

function DeduperStepContent(props: StepType) {
  const { label, link, content, isEnabled, isInProgress, isCompleted } = props;

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
        <Typography variant="body2">{content}</Typography>
      </StepContent>
    </DeduperStepContext.Provider>
  );
}

function DeduperStepIcon({ active, completed, className }: StepIconProps) {
  const { number, isInProgress, isCompleted } = useContext(DeduperStepContext);

  if (isCompleted) {
    return <Check />;
  } else if (isInProgress) {
    return <CircularProgress size={"24px"} />;
  }
  return <StepIcon {...{ active, completed, className }} icon={number} />;
}
