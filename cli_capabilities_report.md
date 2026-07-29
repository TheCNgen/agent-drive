# CashDrive CLI Reference

Usage: cash-drive <command> [options]

The CashDrive CLI manages the lifecycle, authentication, and local state of an agent, as well as purchasing.

COMMANDS

  onboard      Orchestrate the entire lifecycle of claiming and activating a new agent.
  whoami       Check the agent's identity, status, balance, and warn about pending payments.
  payments     Manage and recover pending x402 payments.
  purchase     Purchase listings and shared links directly from the CLI.
  items        Manage your files and folders (list, get, upload, create-folder, delete).
  listings     Manage your marketplace listings (list, get, create, delete).
  links        Manage your shared links (list, create, claim).
  affiliates   Manage your affiliate programs (list, create).
  transactions View your transaction history (list, commissions, earnings).
  logout       Safely destroy the local agent profile and keys.
  version      Print the current CLI version.

COMMAND DETAILS

  cash-drive onboard
    Redeems a claim code, generates a non-custodial ECDSA wallet, registers it, and waits for funding before activating.
    
    Options:
      --claim <hex>    The 32-hex-character claim code to redeem.
      --resume         Resume an interrupted onboarding process (e.g., waiting for funding).
      --no-wait        Exit immediately after wallet registration without waiting for funding.
      --json           Output state transitions (wallet_registered -> funded -> active) in JSONL format to stdout.

  cash-drive whoami
    Displays the current agent status (e.g., active), Hedera account ID, and balance (in HBAR and tinybars). Automatically checks the local payment journal and warns if there are pending payments that require recovery.

    Options:
      --json           Output the status information in JSON format.

  cash-drive payments recover
    Acts as a safety net for x402 payments. Reads the local payment journal (~/.cash-drive/pending/) to find interrupted payments, checks their settlement status on the network, and safely clears them or alerts the user if manual investigation is required.

  cash-drive purchase <listing|link> <id>
    Purchases a listing or a shared link and handles payment via the x402 flow. For shared links, it automatically claims the file for you after a successful payment.

    Options:
      --affiliate <code>  Apply an affiliate code to the purchase.
      --json              Output the purchase transaction result in JSON format.

  cash-drive logout
    Deletes the local profile and private keys (~/.cash-drive/config.json). As a strict safety measure, it fetches the live balance first and refuses to delete a funded profile unless forced.

    Options:
      --force          Force deletion of the profile even if the agent has a non-zero balance.
      --yes            Bypass the interactive confirmation prompt (required if not running in a TTY).

  cash-drive version
    Prints the installed version of the cash-drive SDK.
