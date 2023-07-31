import React, { useState, useContext, createContext } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import StepContent from "@mui/material/StepContent";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import StepIcon, { StepIconProps } from "@mui/material/StepIcon";
import { useStepContext } from "@mui/material/Step";
import { CircularProgress, Grow } from "@mui/material";
import Check from "@mui/icons-material/Check";
import { AppContext } from "utils/AppContext";

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

interface StepType {
  number: number;
  label: string;
  state: "active" | "completed" | "inProgress" | "disabled";
  link?: string;
  content?: React.ReactNode;
}

const defaultSteps: Array<StepType> = [
  {
    number: 1,
    label: "Authorize",
    link: "/auth/google",
    state: "active",
  },
  {
    number: 2,
    label: "Select Options",
    link: "/task_options",
    state: "disabled",
  },
  {
    number: 3,
    label: "Process Duplicates",
    link: "/active_task",
    state: "disabled",
  },
  {
    number: 4,
    label: "Review and Delete Duplicates",
    link: "/active_task",
    state: "disabled",
  },
];

const DeduperStepContext = createContext<StepType>({
  label: "",
  state: "disabled",
});

function DeduperStepper() {
  const { isLoggedIn, user, hasActiveTask, activeTask } =
    useContext(AppContext);

  let steps = structuredClone(defaultSteps);
  let activeStep = 0; // TODO: just calculate this?

  if (isLoggedIn) {
    steps[0].state = "completed";
    steps[0].content = `Logged in as ${user?.email}`;
    steps[1].state = "active";
    activeStep = 1;
  }
  if (hasActiveTask) {
    steps[1].state = "completed";
    steps[2].state = "active";
    activeStep = 2;
    if (["PENDING", "PROGRESS"].includes(activeTask?.status)) {
      steps[2].state = "inProgress";
    } else if (activeTask?.status == "SUCCESS") {
      steps[2].state = "completed";
      steps[3].state = "active";
      activeStep = 3;
    }
  }

  return (
    <Stepper
      orientation="vertical"
      activeStep={activeStep}
      sx={{
        [`& .MuiStepContent-root, & .MuiStepConnector-root`]: {
          // Adjust alignment with an unexpected button inside steps
          marginLeft: "19px",
        },
      }}
    >
      {steps.map((step, index) => (
        <Step key={step.label} expanded={true} active={index <= activeStep}>
          <DeduperStepContent key={step.label} {...step} />
        </Step>
      ))}
    </Stepper>
  );
}

function DeduperStepContent({ number, label, link, state, content }: StepType) {
  return (
    <DeduperStepContext.Provider
      value={{ number, label, link, state, content }}
    >
      <Button
        variant="text"
        size="small"
        sx={{ p: 1 }}
        href={link}
        disabled={state === "disabled"}
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
  const { number, state } = useContext(DeduperStepContext);

  if (state === "completed") {
    return <Check />;
  } else if (state === "inProgress") {
    return <CircularProgress size={"24px"} />;
  }
  return <StepIcon {...{ active, completed, className }} icon={number} />;
}
