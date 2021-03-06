import React, { useEffect, useState, useMemo } from "react";
// import "./incidenttable.css";
import "react-table/react-table.css";

import Button from "@material-ui/core/Button";
import EditIcon from "@material-ui/icons/Edit";
import Grid from "@material-ui/core/Grid";

import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";

import Chip from "@material-ui/core/Chip";

import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";

import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";

import DateFnsUtils from "@date-io/date-fns";
import { MuiPickersUtilsProvider, KeyboardDatePicker } from "@material-ui/pickers";

import Skeleton from "@material-ui/lab/Skeleton";

import { useStateWithDynamicDefault } from "../../utils";
import { formatDuration, formatTimestamp } from "../../utils";

import { makeConfirmationButton } from "../../components/buttons/ConfirmationButton";
import { UseAlertSnackbarResultType } from "../../components/alertsnackbar";
import CenterContainer from "../../components/centercontainer";

import api, {
  Event,
  EventType,
  Incident,
  IncidentTag,
  IncidentTicketUrlBody,
  Acknowledgement,
  AcknowledgementBody,
} from "../../api";
import { useApiIncidentAcks, useApiIncidentEvents } from "../../api/hooks";

import SignedMessage from "./SignedMessage";
import SignOffAction from "./SignOffAction";
import { useStyles } from "./styles";

import { AckedItem, OpenItem, TicketItem } from "../incident/Chips";

type IncidentDetailsListItemPropsType = {
  title: string;
  detail: string | React.ReactNode;
};

const IncidentDetailsListItem: React.FC<IncidentDetailsListItemPropsType> = ({
  title,
  detail,
}: IncidentDetailsListItemPropsType) => {
  return (
    <ListItem>
      <ListItemText primary={title} secondary={detail} />
    </ListItem>
  );
};

type EventListItemPropsType = {
  event: Event;
};

const EventListItem: React.FC<EventListItemPropsType> = ({ event }: EventListItemPropsType) => {
  const classes = useStyles();
  return (
    <div className={classes.message}>
      <SignedMessage
        message={event.description}
        timestamp={event.timestamp}
        username={event.actor.username}
        content={
          <ListItemText
            primary={event.type.display}
            secondary={<Typography paragraph>{event.description}</Typography>}
          />
        }
      />
    </div>
  );
};

type Tag = {
  key: string;
  value: string;
};

type TagChipPropsType = {
  tag: Tag;
  small?: boolean;
};

const isValidUrl = (url: string) => {
  // Pavlo's answer at
  // https://stackoverflow.com/questions/5717093/check-if-a-javascript-string-is-a-url
  try {
    new URL(url);
  } catch (_) {
    return false;
  }
  return true;
};

const hyperlinkIfAbsoluteUrl = (url: string, title: string) => {
  if (isValidUrl(url)) {
    return <a href={url}>{title}</a>;
  } else {
    return url;
  }
};

const TagChip: React.FC<TagChipPropsType> = ({ tag, small }: TagChipPropsType) => {
  if (isValidUrl(tag.value)) {
    return (
      <Chip
        size={(small && "small") || undefined}
        label={`${tag.key}=${tag.value}`}
        component="a"
        href={tag.value}
        clickable
      />
    );
  }
  return <Chip size={(small && "small") || undefined} label={`${tag.key}=${tag.value}`} />;
};

type TicketModifiableFieldPropsType = {
  url?: string;
  saveChange: (newUrl?: string) => void;
};

const TicketModifiableField: React.FC<TicketModifiableFieldPropsType> = ({
  url: urlProp,
  saveChange,
}: TicketModifiableFieldPropsType) => {
  const classes = useStyles();

  const [changeUrl, setChangeUrl] = useState<boolean>(false);
  const [url, setUrl] = useStateWithDynamicDefault<string | undefined>(urlProp);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUrl(event.target.value);
    setChangeUrl(true);
  };

  const handleSave = () => {
    // If url is empty string ("") store it as undefined.
    if (url !== undefined && changeUrl) saveChange(url || undefined);
    setChangeUrl(false);
  };

  const error = useMemo(() => !(url || !isValidUrl(url || "")), [url]);

  return (
    <ListItem>
      <Grid container direction="row" justify="space-between">
        <TextField
          label="Ticket"
          defaultValue={url || ""}
          InputProps={{
            readOnly: !changeUrl,
          }}
          onChange={handleChange}
          error={error}
          helperText={error && "Invalid URL"}
        />
        {(!changeUrl && (
          <Button endIcon={<EditIcon />} onClick={() => setChangeUrl(true)}>
            Edit
          </Button>
        )) || (
          <Button className={classes.safeButton} onClick={() => handleSave()} disabled={error}>
            Set ticket URL
          </Button>
        )}
      </Grid>
    </ListItem>
  );
};

type AckListItemPropsType = {
  ack: Acknowledgement;
};

const AckListItem: React.FC<AckListItemPropsType> = ({ ack }: AckListItemPropsType) => {
  const classes = useStyles();

  const ackDate = new Date(ack.event.timestamp);
  const formattedAckDate = formatTimestamp(ackDate);

  let hasExpired = false;
  let expiresMessage;
  if (ack.expiration) {
    const date = new Date(ack.expiration);
    if (Date.parse(ack.expiration) < Date.now()) {
      expiresMessage = `Expired ${formatTimestamp(date)}`;
      hasExpired = true;
    } else {
      expiresMessage = `Expires ${formatTimestamp(date)}`;
    }
  }

  return (
    <div className={classes.message}>
      <SignedMessage
        message={ack.event.description}
        timestamp={formattedAckDate}
        username={ack.event.actor.username}
        content={
          <ListItemText
            primary={expiresMessage || ""}
            secondary={
              <Typography paragraph style={{ textDecoration: hasExpired ? "line-through" : "none" }}>
                {ack.event.description}
              </Typography>
            }
          />
        }
      />
    </div>
  );
};

type CreateAckPropsType = {
  onSubmitAck: (ack: AcknowledgementBody) => void;
};

const CreateAck: React.FC<CreateAckPropsType> = ({ onSubmitAck }: CreateAckPropsType) => {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const handleSubmit = (msg: string) => {
    // TODO: switch to use API when implemented in backend
    onSubmitAck({
      event: {
        description: msg,
        timestamp: new Date().toISOString(),
      },
      expiration: selectedDate && selectedDate.toISOString(),
    });
  };

  const handleDateChange = (date: Date | null) => {
    setSelectedDate(date);
  };

  return (
    <SignOffAction
      dialogTitle="Submit acknowledment"
      dialogContentText="Write a message describing why this incident was acknowledged "
      dialogSubmitText="Submit"
      dialogCancelText="Cancel"
      dialogButtonText="Create acknowledegment"
      title="Submit acknowledment"
      question="Are you sure you want to acknowledge this incident?"
      onSubmit={handleSubmit}
    >
      <MuiPickersUtilsProvider utils={DateFnsUtils}>
        <KeyboardDatePicker
          disableToolbar
          format="MM/dd/yyyy"
          margin="normal"
          id="expiry-date"
          label="Expiry date"
          value={selectedDate}
          onChange={handleDateChange}
          KeyboardButtonProps={{
            "aria-label": "change date",
          }}
        />
      </MuiPickersUtilsProvider>
    </SignOffAction>
  );
};

type ManualClosePropsType = {
  open: boolean;
  onManualClose: (msg: string) => void;
  onManualOpen: () => void;
};

const ManualClose: React.FC<ManualClosePropsType> = ({ open, onManualClose, onManualOpen }: ManualClosePropsType) => {
  const classes = useStyles();

  if (open) {
    return (
      <SignOffAction
        dialogTitle="Manually close incident"
        dialogContentText="Write a message describing why the incident was manually closed"
        dialogSubmitText="Close now"
        dialogCancelText="Cancel"
        dialogButtonText="Close incident"
        title="Manually close incident"
        question="Are you sure you want to close this incident?"
        onSubmit={onManualClose}
      />
    );
  } else {
    const ReopenButton = makeConfirmationButton({
      title: "Reopen incident",
      question: "Are you sure you want to reopen this incident?",
      onConfirm: onManualOpen,
    });

    return (
      <ReopenButton variant="contained" className={classes.dangerousButton}>
        Reopen incident
      </ReopenButton>
    );
  }
};

type IncidentDetailsPropsType = {
  incident: Incident;
  onIncidentChange: (incident: Incident) => void;
  displayAlertSnackbar: UseAlertSnackbarResultType["displayAlertSnackbar"];
};

const IncidentDetails: React.FC<IncidentDetailsPropsType> = ({
  incident,
  onIncidentChange,
  displayAlertSnackbar,
}: IncidentDetailsPropsType) => {
  const classes = useStyles();

  const [{ result: acks, isLoading: isAcksLoading }, setAcksPromise] = useApiIncidentAcks();
  const [{ result: events, isLoading: isEventsLoading }, setEventsPromise] = useApiIncidentEvents();

  useEffect(() => {
    setAcksPromise(api.getIncidentAcks(incident.pk));
    setEventsPromise(api.getIncidentEvents(incident.pk));
  }, [setAcksPromise, setEventsPromise, incident]);

  const chronoAcks = useMemo<Acknowledgement[]>(() => {
    return [...(acks || [])].sort((first: Acknowledgement, second: Acknowledgement) => {
      const firstTime = Date.parse(first.event.timestamp);
      const secondTime = Date.parse(second.event.timestamp);
      if (firstTime < secondTime) {
        return 1;
      } else if (firstTime > secondTime) {
        return -1;
      }
      if (first.expiration && second.expiration) {
        const firstExpires = Date.parse(first.expiration);
        const secondExpires = Date.parse(second.expiration);
        return firstExpires < secondExpires ? 1 : firstExpires > secondExpires ? -1 : 0;
      }
      return first.expiration ? 1 : -1;
    });
  }, [acks]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleManualClose = (msg: string) => {
    api
      .postIncidentCloseEvent(incident.pk, msg)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .then((event: Event) => {
        // TODO: add close event to list of events
        displayAlertSnackbar(`Closed incident ${incident && incident.pk}`, "success");
        onIncidentChange({ ...incident, open: false });
      })
      .catch((error) => {
        displayAlertSnackbar(`Failed to close incident ${incident && incident.pk} - ${error}`, "error");
      });
  };

  const handleManualOpen = () => {
    api
      .postIncidentReopenEvent(incident.pk)
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      .then((event: Event) => {
        // TODO: add open event to list of events
        displayAlertSnackbar(`Reopened incident ${incident && incident.pk}`, "success");
        onIncidentChange({ ...incident, open: true });
      })
      .catch((error) => {
        displayAlertSnackbar(`Failed to reopen incident ${incident && incident.pk} - ${error}`, "error");
      });
  };

  const ackExpiryDate = undefined;

  // TODO: get tag from incident
  const tags = useMemo(
    () =>
      incident.tags.map((tag: IncidentTag) => {
        const [key, value] = tag.tag.split("=", 2);
        return { key, value };
      }),
    [incident],
  );

  // These are just used for "skeletons" that are displayed
  // when the data is loading.
  const defaultEvent: Event = {
    pk: 1,
    incident: 1,
    actor: { pk: 2, username: "test" },
    timestamp: "2011-11-11T11:11:11+02:00",
    type: {
      value: EventType.INCIDENT_START,
      display: "Incident start",
    },
    description: "",
  };

  const defaultAck: Acknowledgement = {
    pk: 1,
    event: defaultEvent,
    expiration: "2020-02-14T03:04:14.387000+01:00",
  };

  return (
    <div className={classes.root}>
      <Grid container spacing={3} className={classes.grid}>
        <Grid container item spacing={2} md alignItems="stretch" direction="column">
          <Grid item>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Status
                </Typography>
                <CenterContainer>
                  <OpenItem open={incident.open} />
                  <AckedItem acked={incident.acked} expiration={ackExpiryDate} />
                  <TicketItem ticketUrl={incident.ticket_url} />
                </CenterContainer>
              </CardContent>
            </Card>
          </Grid>

          <Grid item>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Tags
                </Typography>
                {tags.map((tag: Tag) => (
                  <TagChip key={tag.key} tag={tag} />
                ))}
              </CardContent>
            </Card>
          </Grid>

          <Grid item>
            <Card>
              <CardContent>
                <Typography color="textSecondary" gutterBottom>
                  Primary details
                </Typography>
                <List>
                  <IncidentDetailsListItem title="Description" detail={incident.description} />
                  <IncidentDetailsListItem title="Start time" detail={formatTimestamp(incident.start_time)} />
                  {incident.stateful && (
                    <IncidentDetailsListItem
                      title="Duration"
                      detail={formatDuration(incident.start_time, incident.end_time || undefined)}
                    />
                  )}
                  <IncidentDetailsListItem title="Source" detail={incident.source.name} />
                  <IncidentDetailsListItem
                    title="Details URL"
                    detail={hyperlinkIfAbsoluteUrl(incident.details_url, "More details") || "–"}
                  />

                  <TicketModifiableField
                    url={incident.ticket_url}
                    saveChange={(url?: string) => {
                      // TODO: api
                      api
                        .patchIncidentTicketUrl(incident.pk, url || "")
                        // eslint-disable-next-line @typescript-eslint/camelcase
                        .then(({ ticket_url }: IncidentTicketUrlBody) => {
                          displayAlertSnackbar(`Updated ticket URL for ${incident.pk}`, "success");

                          // eslint-disable-next-line @typescript-eslint/camelcase
                          onIncidentChange({ ...incident, ticket_url });
                        })
                        .catch((error) => {
                          displayAlertSnackbar(`Failed to updated ticket URL ${error}`, "error");
                        });
                    }}
                  />
                  <ListItem>
                    <CenterContainer>
                      <ManualClose
                        open={incident.open}
                        onManualClose={handleManualClose}
                        onManualOpen={handleManualOpen}
                      />
                    </CenterContainer>
                  </ListItem>
                </List>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Grid container item spacing={2} md direction="column">
          <Grid item>
            <Typography color="textSecondary" gutterBottom>
              Acknowledgements
            </Typography>
            <List>
              {(isAcksLoading &&
                Array.from(new Array(3)).map((item: number, index: number) => (
                  <Skeleton key={index} variant="rect" animation="wave">
                    {" "}
                    <AckListItem ack={defaultAck} />
                  </Skeleton>
                ))) ||
                chronoAcks.map((ack: Acknowledgement) => <AckListItem key={ack.event.timestamp} ack={ack} />)}
            </List>
            <CenterContainer>
              <CreateAck
                key={(acks || []).length}
                onSubmitAck={(ack: AcknowledgementBody) => {
                  api
                    .postAck(incident.pk, ack)
                    .then((ack: Acknowledgement) => {
                      displayAlertSnackbar(
                        `Submitted ${ack.event.type.display} for ${incident && incident.pk}`,
                        "success",
                      );
                      // NOTE: this assumes that nothing about the incident
                      // changes in the backend response other than the acked
                      // field, which may not be true in the future.
                      onIncidentChange({ ...incident, acked: true });
                    })
                    .catch((error) => {
                      displayAlertSnackbar(`Failed to post ack ${error}`, "error");
                    });
                }}
              />
            </CenterContainer>
          </Grid>
        </Grid>
        <Grid container item spacing={2} md direction="column">
          <Grid item>
            <Typography color="textSecondary" gutterBottom>
              Related events
            </Typography>
            <List>
              {(isEventsLoading &&
                Array.from(new Array(3)).map((item: number, index: number) => (
                  <Skeleton key={index} variant="rect" animation="wave">
                    {" "}
                    <EventListItem event={defaultEvent} />
                  </Skeleton>
                ))) ||
                (events || [])
                  .filter((event: Event) => event.type.value !== "ACK")
                  .map((event: Event) => <EventListItem key={event.pk} event={event} />)}
            </List>
          </Grid>
        </Grid>
      </Grid>
    </div>
  );
};

export default IncidentDetails;
