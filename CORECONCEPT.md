# Transport Network Simulator

## Project Concept

**Transport Network Simulator** — a simulation game focused on engineering challenges, in which a new city, a set of independent transportation companies, and their information systems are generated for each playthrough.

The player’s task is to develop an organizational and software infrastructure that will unite independent carriers into a single transportation network.

The system must allow the end user to:

* plan routes between any two points;
* view current schedules;
* receive information about delays, cancellations, and other changes;
* adjust the route in response to changes in the transportation network.

At the same time, the transportation system continues to operate independently of the integration infrastructure, and the player must develop a method for individual companies to interact with one another.

Each task is likely to be different, so there should be no universal, predefined solution.

---

# Simulator Structure

## 1. World Generator

Generates the environment in which the transportation system will operate.

### City

* city map generation;
* roads and other transportation infrastructure;
* districts;
* points of interest;
* population and potential locations of transportation demand.

In the early stages, an external public API may be used to generate the geography.

In the future—fully procedural generation.

### Names

Generating names for:

* cities;
* districts;
* streets;
* stops;
* stations;
* transportation companies;
* routes;
* vehicles.

---

# 2. Transportation Company Generator

Each transportation company is an independent system.

A company has:

* its own set of routes;
* vehicles;
* a schedule;
* stops and stations;
* operating rules;
* an internal data model;
* its own API.

### Generating Transport Routes

The generator creates the company’s transport network.

Routes can be:

* efficient;
* inefficient;
* congested;
* poorly coordinated with other companies;
* specialized for specific regions.

The network is not guaranteed to be optimal.

### Generating Information System

Every company has its own data representation schema.

For example:

* custom field names;
* custom IDs;
* custom JSON schemas;
* custom API endpoints;
* varying levels of available real-time information;
* different API rules and restrictions.

Thus, integrating multiple providers is an engineering challenge in and of itself.

---

# 3. Transportation Simulation

Simulates the operation of a generated transportation network.

### Passengers

Simulates city residents who:

* have a starting point and a destination;
* have a desired travel time;
* choose a mode of transportation;
* wait for transportation;
* transfer between modes;
* react to delays and changes;
* can change their route or cancel their trip.

### Transportation

Vehicles are simulated:

* operating on schedule;
* carrying passengers;
* running late;
* breaking down;
* subject to rerouting;
* subject to cancellation;
* interacting with other elements of the network.

### Events

The simulator must generate events that change the state of the transportation network.

For example:

* delay;
* breakdown;
* trip cancellation;
* stop closure;
* route change;
* overcrowding;
* other random or scenario-based events.

### API Environment

Transportation companies’ APIs must return data consistent with the current state of the simulation.

Thus, the API is not a static set of mock responses—it is an interface to a live simulated world.

---

# 4. Player’s Task

The player creates their own **project solution** that interacts with the simulated transportation network.

At the initial stage, the solution may consist of a folder containing scripts or a standalone software project.

The player must implement the necessary integration infrastructure.

For example:

* retrieving data from transportation companies;
* normalizing data;
* matching stops and routes;
* building a unified model of the transportation network;
* route search;
* retrieving and processing real-time data;
* disseminating notifications about changes;
* adapting routes.

The specific set of requirements may depend on the generated task.

---

# 5. Monitoring and Testing

The player must be able to:

### Monitoring

Monitor the operation of the transportation network and their own solution.

Possible views:

* map;
* transportation traffic;
* passenger flows;
* API requests;
* delays;
* route changes;
* internal system state.

### Testing

Run a series of simulations of their solution using the same or different configurations.

Testing should allow for comparing the results of different implementations.

### Evaluation

The system must calculate the solution’s effectiveness.

Possible metrics:

* average trip time;
* average wait time;
* number of transfers;
* number of failed transfers;
* number of passengers who did not reach their destination;
* accuracy and timeliness of information;
* delay in the dissemination of real-time information;
* API load;
* resource usage;
* system stability under load.

---

# 6. Engineering Challenge

The main feature of the project is that **the player does not receive a ready-made integration solution**.

The player receives:

* a transportation network;
* a set of independent operators;
* documentation and access to their APIs;
* the current state of the simulation;
* success criteria.

Based on this, they must develop a solution on their own.

In the future, there may be various types of engineering challenges:

* integration of multiple APIs;
* building a unified journey planner;
* a real-time system;
* routing under unstable network conditions;
* synchronization between operators;
* identifying and resolving data issues;
* scaling the system;
* fault tolerance.

---

# General Model

```text
                 WORLD GENERATOR
                       │
          ┌────────────┴────────────┐
          │                         │
        CITY                 TRANSPORT OPERATORS
          │                         │
          │             ┌───────────┼───────────┐
          │             │           │           │
          │           Bus A       Bus B       Metro
          │             │           │           │
          │             └───────────┼───────────┘
          │                         │
          └─────────────┬───────────┘
                        │
                 LIVE SIMULATION
                        │
             ┌──────────┼──────────┐
             │          │          │
         Passengers  Vehicles     Events
             │          │          │
             └──────────┼──────────┘
                        │
                      APIs
                        │
                        ▼
               PLAYER SOLUTION
                        │
             ┌──────────┼──────────┐
             │          │          │
          Routing     Realtime   Integration
             │          │          │
             └──────────┼──────────┘
                        │
                        ▼
                    EVALUATOR
                        │
                 performance score
```