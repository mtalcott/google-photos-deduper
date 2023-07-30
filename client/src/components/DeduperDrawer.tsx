import { useState } from "react";
import Box from "@mui/material/Box";
import Drawer from "@mui/material/Drawer";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import StepContent from "@mui/material/StepContent";
import Button from "@mui/material/Button";
import Paper from "@mui/material/Paper";
import Typography from "@mui/material/Typography";

const steps = [
  {
    label: "Authorize",
    description: `Step 1`,
  },
  {
    label: "Select Options",
    description: `Step 2`,
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
  const [activeStep, setActiveStep] = useState(0);

  return (
    <Stepper
      activeStep={activeStep}
      orientation="vertical"
      sx={{
        [`& .MuiStepContent-root, & .MuiStepConnector-root`]: {
          // Adjust alignment with an unexpected button inside steps
          marginLeft: "19px",
        },
      }}
    >
      {steps.map((step, index) => (
        <Step key={step.label}>
          <DeduperStepContent
            key={step.label}
            {...{ activeStep, step, index }}
          />
        </Step>
      ))}
    </Stepper>
  );
}

function DeduperStepContent({ activeStep, step, index }) {
  const isActive = activeStep === index;
  const isLinkActive = index <= activeStep;

  return (
    <>
      <Button
        variant="text"
        size="small"
        sx={{ p: 1 }}
        disabled={!isLinkActive}
      >
        <StepLabel sx={{ py: 0 }}>{step.label}</StepLabel>
      </Button>
      <StepContent>
        <Typography>{step.description}</Typography>
      </StepContent>
    </>
  );
}
