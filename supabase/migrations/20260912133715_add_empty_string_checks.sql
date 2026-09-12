alter table public.practitioners
    add constraint practitioners_name_check
    check (length(btrim(name)) > 0) not valid;

alter table public.practitioners
    validate constraint practitioners_name_check;

alter table public.practitioner_contacts
    add constraint contacts_email_check
    check (length(btrim(contact_email)) > 0) not valid;

alter table public.practitioner_contacts
    validate constraint contacts_email_check;