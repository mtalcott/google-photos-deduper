import { useState } from "react";
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

const steps = [
  {
    label: "Authorize",
    description: `Logged in as user@email.com`,
  },
  {
    label: "Select Options",
  },
  {
    label: "Process Duplicates",
    description: `Step 3`,
  },
  {
    label: "Review and Delete Duplicates",
    description: `Step 4`,
  },
];

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

function DeduperStepper() {
  const [activeStep, setActiveStep] = useState(2);

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
          <DeduperStepContent
            key={step.label}
            active={index <= activeStep}
            {...{ step, index }}
          />
        </Step>
      ))}
    </Stepper>
  );
}

function DeduperStepContent({ active, step }) {
  return (
    <>
      <Button variant="text" size="small" sx={{ p: 1 }} disabled={!active}>
        <StepLabel sx={{ py: 0 }} StepIconComponent={DeduperStepIcon}>
          {step.label}
        </StepLabel>
      </Button>
      <StepContent TransitionComponent={Grow}>
        <Typography variant="body2">{step.description}</Typography>
      </StepContent>
    </>
  );
}

function DeduperStepIcon({ active, completed, className }: StepIconProps) {
  const { icon, index } = useStepContext();
  let stepIcon = icon;
  if (index == 0) {
    stepIcon = <Check />;
  } else if (index == 1) {
    stepIcon = <CircularProgress size={"24px"} />;
  }
  return (
    <StepIcon {...{ active, completed, className }} icon={stepIcon}>
      xasdf
    </StepIcon>
  );
}
